import childProcess from "node:child_process";
import fs from "node:fs";
import externalResources from "#core/external-resources";
import fetch from "#core/fetch";
import { globSync } from "#core/glob";
import Message from "#core/message";
import stream from "#core/stream";
import Threads from "#core/threads";
import Mutex from "#core/threads/mutex";
import { TmpFile } from "#core/tmp";

const resource = await externalResources.add( "corejslib/core/resources/ffmpeg-" + process.platform ).check(),
    ffmpeg = resource.getResourcePath( "bin/ffmpeg" + process.platform === "win32"
        ? ".exe"
        : "" );

const MODELS = new Set( [

        //
        "tiny",
        "tiny.en",
        "tiny-q5_1",
        "tiny.en-q5_1",
        "tiny-q8_0",
        "base",
        "base.en",
        "base-q5_1",
        "base.en-q5_1",
        "base-q8_0",
        "small",
        "small.en",
        "small.en-tdrz",
        "small-q5_1",
        "small.en-q5_1",
        "small-q8_0",
        "medium",
        "medium.en",
        "medium-q5_0",
        "medium.en-q5_0",
        "medium-q8_0",
        "large-v1",
        "large-v2",
        "large-v2-q5_0",
        "large-v2-q8_0",
        "large-v3",
        "large-v3-q5_0",
        "large-v3-turbo",
        "large-v3-turbo-q5_0",
        "large-v3-turbo-q8_0",
    ] ),
    PARAMS = {
        "language": "en",
        "detect_language": false,
        "translate": false,
        "use_gpu": true,
        "flash_attn": false,
        "no_prints": true,
        "comma_in_time": false,
        "no_timestamps": true,
        "audio_ctx": 0,
        "max_len": 0,
        "progress_callback": progress => {},
    };

export default class Qbittorrent {
    #app;
    #config;
    #modelsPath;
    #mutexSet = new Mutex.Set();
    #installedModels;
    #loadedModels = {};
    #threads = new Threads();

    constructor ( app, config ) {
        this.#app = app;
        this.#config = config;

        this.#modelsPath = app.env.dataDir + "/whisper/models";
    }

    // properties
    get app () {
        return this.#app;
    }

    get config () {
        return this.#config;
    }

    get modelsPath () {
        return this.#modelsPath;
    }

    get models () {
        return MODELS;
    }

    get defaultModel () {
        return this.#config.defaultModel;
    }

    get installedModels () {
        return this.#installedModels;
    }

    get loadedModels () {
        return Object.keys( this.#loadedModels );
    }

    // public
    async init () {
        this.#installedModels = new Set( globSync( "*.bin", {
            "cwd": this.#modelsPath,
        } )
            .map( file => file.replace( ".bin", "" ) )
            .filter( model => MODELS.has( model ) ) );

        return result( 200 );
    }

    isModelValid ( model ) {
        return MODELS.has( model );
    }

    async installModel ( model, { force } = {} ) {
        if ( !this.isModelValid( model ) ) return result( [ 400, "Invalid model" ] );

        if ( !force && this.#installedModels.has( model ) ) return result( 200 );

        const mutex = this.#mutexSet.get( model );

        if ( !mutex.tryLock() ) return mutex.wait();

        fs.mkdirSync( this.#modelsPath, {
            "recursive": true,
        } );

        const modelPath = this.#modelsPath + "/" + model + ".bin";

        const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${ model }.bin`;

        var res;

        try {
            res = await fetch( url );
            if ( !res.ok ) throw res;

            const tmp = await res.toTmpFile();

            await fs.promises.cp( tmp.path, modelPath );

            tmp.destroy();

            this.#installedModels.add( model );

            res = result( 200 );
        }
        catch ( e ) {
            res = result.fromError( e );
        }

        mutex.unlock( res );

        return res;
    }

    async unloadModel ( model ) {
        if ( !this.isModelValid( model ) ) throw result( [ 400, "Invalid model" ] );

        return this.#unloadModel( model );
    }

    async deleteModel ( model ) {
        if ( !this.isModelValid( model ) ) return result( [ 400, "Invalid model" ] );

        if ( !this.#installedModels.has( model ) ) return result( 200 );

        const res = await this.#unloadModel( model );
        if ( !res.ok ) return res;

        const modelPath = this.#modelsPath + "/" + model + ".bin";

        await fs.promises.rm( modelPath, {
            "force": true,
        } );

        this.#installedModels.delete( model );

        return result( 200 );
    }

    async detectLanguage ( message, { model } = {} ) {
        using disposableStack = new DisposableStack();

        message = Message.new( message );

        disposableStack.use( message );

        model ||= this.defaultModel;

        const params = {
            ...PARAMS,
            "detect_language": true,
        };

        const res = await this.#run( message, model, params );
        if ( !res.ok ) return res;

        return result( 200, {
            "language": res.data.language,
            model,
        } );
    }

    async transformSpeechToText ( message, { model, language } = {} ) {
        using disposableStack = new DisposableStack();

        message = Message.new( message );

        disposableStack.use( message );

        model ||= this.defaultModel;

        const params = {
            ...PARAMS,
            "language": language || "auto",
            "detect_language": false,
        };

        const res = await this.#run( message, model, params );
        if ( !res.ok ) return res;

        return result( 200, {
            "text": res.data.transcription
                .map( part => part[ 2 ].trim() )
                .join( "\n" )
                .trim(),
            "language": language || res.data.language,
            model,
        } );
    }

    // private
    async #run ( message, model, params ) {
        var res, wavFile;

        try {
            if ( !this.isModelValid( model ) ) throw result( [ 400, "Invalid model" ] );

            // install missed model
            if ( !this.#installedModels.has( model ) ) {
                res = await this.installModel( model );
                if ( !res.ok ) throw res;
            }

            // convert audio to wav
            res = await this.#createWavFile( message );
            if ( !res.ok ) throw res;
            wavFile = res.data;

            // load model
            if ( !this.#loadedModels[ model ] ) {
                const threadName = "whisper-" + model;

                await this.#threads.start( {
                    [ threadName ]: {
                        "numberOfThreads": 1,
                        "module": new URL( "whisper/worker.js", import.meta.url ),
                        "args": null,
                    },
                } );

                this.#loadedModels[ model ] = threadName;
            }

            res = await this.#threads.call( this.#loadedModels[ model ], "run-whisper", {
                ...params,
                "model": this.modelsPath + "/" + model + ".bin",
                "fname_inp": wavFile.path,
            } );
        }
        catch ( e ) {
            res = result.fromError( e );
        }

        // cleanup
        message?.destroy();
        wavFile?.destroy();

        return res;
    }

    async #createWavFile ( message ) {
        const wavFile = new TmpFile( {
            "extname": ".wav",
        } );

        await using inputStream = await message.createBodyStream();

        // convert audio to wav
        const res = await new Promise( resolve => {
            const proc = childProcess.spawn( ffmpeg, [ "-i", "-", "-ar", 16_000, "-ac", 1, "-c:a", "pcm_s16le", wavFile.path ], {
                "stdio": [ "pipe", "ignore", "ignore" ],
            } );

            proc.once( "exit", code => {
                if ( code ) {
                    resolve( result( 500 ) );
                }
                else {
                    resolve( result( 200 ) );
                }
            } );

            stream.pipeline( inputStream, proc.stdin, () => {} );
        } );

        message.destroy();

        if ( res.ok ) {
            return result( 200, wavFile );
        }
        else {
            wavFile.destroy();

            return res;
        }
    }

    async #unloadModel ( model ) {
        if ( this.#loadedModels[ model ] ) {
            const res = await this.#threads.terminateThread( this.#loadedModels[ model ] );
            if ( !res.ok ) return res;

            delete this.#loadedModels[ model ];
        }

        return result( 200 );
    }
}

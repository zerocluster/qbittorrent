import childProcess from "node:child_process";

// XXX
// qbittorrent-nox --confirm-legal-notice --webui-port=80 --torrenting-port=9999

export default class Qbittorrent {
    #app;
    #config;
    #ollama;

    constructor ( app, config ) {
        this.#app = app;
        this.#config = config;
    }

    // properties
    get app () {
        return this.#app;
    }

    get config () {
        return this.#config;
    }

    // public
    async init () {
        return result( 200 );
    }

    async start () {

        // start ollama
        this.#ollama = childProcess.spawn( "ollama", [ "serve" ], {
            "env": {
                ...process.env,
                "OLLAMA_MODELS": this.app.env.dataDir + "/ollama/models",
            },
            "stdio": [ "ignore", "inherit", "inherit" ],
        } );

        this.#ollama.once( "exit", this.#onExit.bind( this ) );

        return result( 200 );
    }

    async destroy () {
        if ( this.#ollama ) {
            return new Promise( resolve => {
                this.#ollama.once( "exit", code => {
                    resolve( result( 200 ) );
                } );

                this.#ollama.kill();
            } );
        }
        else {
            return result( 200 );
        }
    }

    // private
    #onExit ( code, signal ) {
        this.#ollama = null;

        process.destroy( { code } );
    }
}

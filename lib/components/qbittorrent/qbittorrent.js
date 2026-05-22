import childProcess from "node:child_process";
import fs from "node:fs";

export default class Qbittorrent {
    #app;
    #config;
    #profileDir;
    #qbittorrent;

    constructor ( app, config ) {
        this.#app = app;
        this.#config = config;

        this.#profileDir = this.#app.env.dataDir + "/qbittorrent";
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
        await fs.promises.mkdir( this.#profileDir, {
            "recursive": true,
        } );

        return result( 200 );
    }

    async start () {

        // start qbittorrent
        this.#qbittorrent = childProcess.spawn(
            "qbittorrent-nox",
            [

                //
                "--confirm-legal-notice",
                "--profile",
                this.#profileDir,
                "--webui-port",
                this.#config.httpPort,
                "--torrenting-port",
                this.#config.torrentPort,
            ],
            {
                "env": {
                    ...process.env,
                },
                "stdio": [ "ignore", "inherit", "inherit" ],
            }
        );

        this.#qbittorrent.once( "exit", this.#onExit.bind( this ) );

        return result( 200 );
    }

    async destroy () {
        if ( this.#qbittorrent ) {
            return new Promise( resolve => {
                this.#qbittorrent.once( "exit", code => {
                    resolve( result( 200 ) );
                } );

                this.#qbittorrent.kill();
            } );
        }
        else {
            return result( 200 );
        }
    }

    // private
    #onExit ( code, signal ) {
        this.#qbittorrent = null;

        process.destroy( { code } );
    }
}

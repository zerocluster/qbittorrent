import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configTemplatePath = fileURLToPath( import.meta.resolve( "#resources/qbittorrent.conf" ) );

export default class Qbittorrent {
    #app;
    #config;
    #profileDir;
    #configPath;
    #qbittorrent;

    constructor ( app, config ) {
        this.#app = app;
        this.#config = config;

        this.#profileDir = this.#app.env.dataDir + "/qbittorrent";
        this.#configPath = this.#profileDir + "/qBittorrent/config/qBittorrent.conf";
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

        // create data directory
        await fs.promises.mkdir( this.#profileDir, {
            "recursive": true,
        } );

        // install config template
        if ( !fs.existsSync( this.#configPath ) ) {
            await fs.promises.mkdir( path.dirname( this.#configPath ), {
                "recursive": true,
            } );

            await fs.promises.cp( configTemplatePath, this.#configPath );
        }

        return result( 200 );
    }

    // XXX parse password???
    // XXX nginx
    async start () {

        // start qbittorrent
        this.#qbittorrent = childProcess.spawn(
            "qbittorrent-nox",
            [

                //
                "--confirm-legal-notice",
                `--profile="${ this.#profileDir }"`,
                `--webui-port=${ this.#config.httpPort }`,
                `--torrenting-port=${ this.#config.torrentPort }`,
            ],
            {
                "env": {
                    ...process.env,
                },
                "stdio": [ "ignore", "inherit", "inherit" ],
            }
        );

        this.#qbittorrent.once( "exit", this.#onExit.bind( this ) );

        // nginx upstream
        if ( this.config.nginx.enabled && this.app.nginxUpstream ) {
            await this.app.nginxUpstream.addProxy( "qbittorrent-http", {
                "upstreamPort": this.config.httpPort,
                "serverNames": this.config.nginx.serverNames,
                "servers": [
                    {
                        "port": 80,
                        "type": "http",
                        "maxBodySize": "10 MiB",
                        "cacheEnabled": true,
                        "cacheBypass": true,
                        "httpsRedirectPort": 443,
                        "hstsMaxAge": "1 year",
                        "hstsSubdomains": false,
                    },
                    {
                        "port": 443,
                        "type": "http",
                        "ssl": true,
                        "maxBodySize": "10 MiB",
                        "cacheEnabled": true,
                        "cacheBypass": true,
                        "httpsRedirectPort": 443,
                        "hstsMaxAge": "1 year",
                        "hstsSubdomains": false,
                    },
                ],
            } );

            await this.app.nginxUpstream.addProxy( "qbittorrent-torrent", {
                "upstreamPort": this.config.torrentPort,
                "servers": [
                    {
                        "port": 6881,
                        "type": "tcp",
                    },
                    {
                        "port": 6881,
                        "type": "udp",
                    },
                ],
            } );
        }

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

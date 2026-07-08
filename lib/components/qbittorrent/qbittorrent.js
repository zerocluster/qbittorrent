import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Passwords from "#core/crypto/passwords";
import RandomValues from "#core/crypto/random-values";
import ejs from "#core/ejs";
import ipSubnets from "#core/ip/subnets";
import QbittorrentApi from "./qbittorrent/api.js";

const configTemplate = await ejs.fromFile( import.meta.resolve( "#resources/qbittorrent.conf" ) );

export default class Qbittorrent {
    #app;
    #config;
    #profileDir;
    #configPath;
    #qbittorrent;
    #api;

    constructor ( app, config ) {
        this.#app = app;
        this.#config = config;

        this.#profileDir = path.join( this.#app.env.dataDir, "qbittorrent" );
        this.#configPath = path.join( this.#profileDir, "config/qBittorrent.conf" );

        this.#api = new QbittorrentApi( `localhost:${ this.#config.httpPort }` );
    }

    // properties
    get app () {
        return this.#app;
    }

    get config () {
        return this.#config;
    }

    get api () {
        return this.#api;
    }

    // public
    async init () {

        // create data directory
        await fs.promises.mkdir( this.#profileDir, {
            "recursive": true,
        } );

        // install config template
        if ( !fs.existsSync( this.#configPath ) ) {
            const password = Passwords.default.generateRandomPassword();

            await fs.promises.mkdir( path.dirname( this.#configPath ), {
                "recursive": true,
            } );

            await fs.promises.writeFile(
                this.#configPath,
                configTemplate.render( {
                    "username": this.config.username,
                    "passwordHash": this.#hashPassword( password.password ),
                    "authSubnetWhitelist": [ ...ipSubnets.get( "local" ) ].map( range => range.toString() ).join( ", " ),
                } )
            );

            console.info( `[qbittorrent] Username: ${ this.config.username }, password: ${ password.password }` );
        }

        return result( 200 );
    }

    async start () {

        // start qbittorrent
        this.#qbittorrent = childProcess.spawn(
            "qbittorrent-nox",
            [

                //
                "--confirm-legal-notice",
                "--relative-fastresume",
                `--profile="${ path.dirname( this.#profileDir ) }"`,
                `--webui-port=${ this.#config.httpPort }`,
                `--torrenting-port=${ this.#config.torrentPort }`,
            ],
            {
                "stdio": "ignore",
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
                        "port": this.config.nginx.httpPort,
                        "type": "http",
                        "maxBodySize": "10 MiB",
                        "cacheEnabled": true,
                        "cacheBypass": true,
                        "httpsRedirectPort": this.config.nginx.httpsPort,
                        "hstsMaxAge": "1 year",
                        "hstsSubdomains": false,
                    },
                    {
                        "port": this.config.nginx.httpsPort,
                        "type": "http",
                        "useSsl": true,
                        "maxBodySize": "10 MiB",
                        "cacheEnabled": true,
                        "cacheBypass": true,
                        "httpsRedirectPort": this.config.nginx.httpsPort,
                        "hstsMaxAge": "1 year",
                        "hstsSubdomains": false,
                    },
                ],
            } );

            await this.app.nginxUpstream.addProxy( "qbittorrent-torrent", {
                "upstreamPort": this.config.torrentPort,
                "servers": [
                    {
                        "port": this.config.nginx.torrentPort,
                        "type": "tcp",
                    },
                    {
                        "port": this.config.nginx.torrentPort,
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

    #hashPassword ( password ) {
        const salt = Buffer.from( RandomValues.default.getRandomArrayBuffer( 16 ) ),
            hash = crypto.pbkdf2Sync( password, salt, 100_000, 64, "SHA512" );

        return `${ salt.toString( "base64" ) }:${ hash.toString( "base64" ) }`;
    }
}

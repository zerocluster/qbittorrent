import Passwords from "#core/crypto/passwords";
import fetch from "#core/fetch";

const API_VERSION = 2;

export default class QbittorrentApi {
    #host;

    constructor ( host ) {
        this.#host = host;
    }

    // public
    async getQbittorrentVersion () {
        return this.#doRequest( "app/version" );
    }

    async getQbittorrentApiVersion () {
        return this.#doRequest( "app/webapiVersion" );
    }

    async getQbittorrentBuildInfo () {
        return this.#doRequest( "app/buildInfo" );
    }

    async setPassword ( password ) {
        if ( !password ) {
            password = Passwords.default.generateRandomPassword().password;
        }

        const res = await this.#doRequest( "app/setPreferences", {
            "body": {
                "web_ui_password": password,
            },
        } );

        if ( res.ok ) {
            res.data = { password };
        }

        return res;
    }

    // private
    async #doRequest ( path, { body } = {} ) {
        var method;

        const url = `http://${ this.#host }/api/v${ API_VERSION }/${ path }`,
            headers = {
                "referer": `http://${ this.#host }`,
            };

        if ( body !== undefined ) {
            method = "POST";

            headers[ "content-type" ] = "application/x-www-form-urlencoded";

            body = `json=${ JSON.stringify( body ) }`;
        }

        const res = await fetch( url, {
            method,
            headers,
            body,
        } );

        if ( res.ok ) {
            if ( res.headers.contentType.type === "application/json" ) {
                return result( 200, await res.json() );
            }
            else if ( res.headers.contentType.type === "text/plain" ) {
                return result( 200, await res.text() );
            }
            else {
                return result( 200 );
            }
        }
        else {
            return result( res.status );
        }
    }
}

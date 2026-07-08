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
        return this.#doRequest( "app/setPreferences", {
            "method": "POST",
            "body": {
                "web_ui_password": password,
            },
        } );
    }

    // private
    async #doRequest ( path, { method, body } = {} ) {
        const url = `http://${ this.#host }/api/v${ API_VERSION }/${ path }`;

        const res = await fetch( url, {
            method,
            "headers": {
                "referer": `http://${ this.#host }`,
            },
            "body": body === undefined
                ? undefined
                : `json=${ JSON.stringify( body ) }`,
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

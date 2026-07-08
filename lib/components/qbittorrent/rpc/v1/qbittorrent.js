import fetch from "#core/fetch";

export default Super =>
    class extends Super {

        // public
        async [ "API_set-password" ] ( ctx, password ) {
            const url = `http://127.0.0.1:${ this.app.qbittorrent.config.httpPort }`,
                body = {
                    "web_ui_password": password,
                },
                res = await fetch( `${ url }/api/v2/app/setPreferences`, {
                    "method": "POST",
                    "headers": {
                        "referer": url,
                    },
                    "body": `json=${ JSON.stringify( body ) }`,
                } );

            if ( res.ok ) {
                return result( 200 );
            }
            else {
                return result( res.status );
            }
        }
    };

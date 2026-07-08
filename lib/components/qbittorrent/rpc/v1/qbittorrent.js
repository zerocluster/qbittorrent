export default Super =>
    class extends Super {

        // public
        async [ "API_get-qbittorrent-version" ] ( ctx ) {
            return this.app.qbittorrent.api.getQbittorrentVersion();
        }

        async [ "API_get-qbittorrent-api-version" ] ( ctx ) {
            return this.app.qbittorrent.api.getQbittorrentApiVersion();
        }

        async [ "API_get-qbittorrent-build-info" ] ( ctx ) {
            return this.app.qbittorrent.api.getQbittorrentBuildInfo();
        }

        async [ "API_set-password" ] ( ctx, password ) {
            return this.app.qbittorrent.api.setPassword( password );
        }
    };

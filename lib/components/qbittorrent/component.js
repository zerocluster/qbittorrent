import Qbittorrent from "./qbittorrent.js";

export default Super =>
    class extends Super {

        // protected
        async _install () {
            return new Qbittorrent( this.app, this.config );
        }

        async _init () {
            return this.instance.init();
        }
    };

import DockerEngine from "#core/api/docker/engine";
import App from "#core/app";
import Cron from "#core/cron";

export default class extends App {
    #dockerEngine;

    // eslint-disable-next-line no-unused-private-class-members
    #pruneCron;

    // propeties
    get location () {
        return import.meta.url;
    }

    // protected
    async _init () {
        this.#dockerEngine = new DockerEngine();

        return result( 200 );
    }

    async _start () {
        if ( this.config.pruneCron ) {
            this.#pruneCron = new Cron( this.config.pruneCron ).on( "tick", this.#prune.bind( this ) ).start();
        }

        return result( 200 );
    }

    // private
    async #prune () {

        // await this.#dockerEngine.pruneContainers();

        await this.#dockerEngine.pruneImages( { "tagged": true } );
    }
}

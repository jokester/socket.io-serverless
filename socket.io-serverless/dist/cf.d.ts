import type * as CF from '@cloudflare/worker-types'

export function createEioActor<Bindings>(options: EioActorOptions<Bindings>): any;
export function createSioActor<Bindings>(options: EioActorOptions<Bindings>): any;

interface EioActorOptions<Bindings> {


}

interface SioActorOptions<Bindings> {

}
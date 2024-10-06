import type * as CF from '@cloudflare/workers-types';
import {SioServer} from './SioServer'
import {EngineActorBase} from "../eio/EngineActorBase";
import {SingleActorAdapter} from "./SingleActorAdapter";
import {Persister} from "./Persister";


export async function createSioServer(ctx: CF.DurableObjectState, engineActorNs: CF.DurableObjectNamespace<EngineActorBase>): Promise<SioServer> {
    const persister = new Persister(ctx)
            class BoundAdapter extends SingleActorAdapter {
                override get persister() {
                    return persister
                }
            }
    return new SioServer(
        {
            adapter: BoundAdapter,
        }, ctx, engineActorNs, persister)
}


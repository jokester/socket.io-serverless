import { DefaultMap } from '@jokester/ts-commonutil/lib/collection/default-map';

let enabledNamespaces = new DefaultMap<string, boolean>((namespace) => false)

export function createDebugLogger(namespace: string) {
    return (...args: any[]) => {
        if (enabledNamespaces.getOrCreate(namespace)) {
            console.debug(new Date(), ...args)
        }

    }
}

export function setEnabledLoggerNamespace(namespaces: string[]) {
    enabledNamespaces = new DefaultMap<string, boolean>(namespace => namespaces.some(ns => namespace.startsWith(ns)))
}

export default createDebugLogger;

export {createDebugLogger as debug};
import type NotionBlock from './main';
import type {EditorView} from '@codemirror/view';

export type MarginKind='sidenote'|'marginnote';
interface MarginaliaProvider {
    apiVersion:1;
    active:boolean;
    availability(view:EditorView):string|null;
    insertFromView(view:EditorView,kind:MarginKind):boolean;
}
/** Optional integration only. Markdown syntax, rendering, settings and commands
 * belong to the independently enableable keyline-marginalia plugin. */
export function marginaliaProvider(plugin:NotionBlock):MarginaliaProvider|null {
    const provider=(plugin.app as unknown as {plugins?:{plugins?:Record<string,Partial<MarginaliaProvider>>}}).plugins?.plugins?.['keyline-marginalia'];
    return provider?.apiVersion===1&&provider.active&&typeof provider.availability==='function'&&typeof provider.insertFromView==='function'?provider as MarginaliaProvider:null;
}

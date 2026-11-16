import { mountVueIsland } from "@framework/ui/island";

import Filters from "./filters.vue";

export const mount = (el, context) => mountVueIsland(el, { ...context, component: Filters });

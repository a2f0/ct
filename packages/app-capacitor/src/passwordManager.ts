import { configurePasswordSaver } from "@ct/admin/passwords";
import { nativePasswordSaver } from "./savePassword";

declare const __CT_DASHBOARD_URL__: string;

configurePasswordSaver(nativePasswordSaver(__CT_DASHBOARD_URL__));

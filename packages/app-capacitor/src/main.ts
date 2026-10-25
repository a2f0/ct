// Renders the dashboard; vite.config.ts points its API at the hosted dashboard.
import "./passwordManager";
import "@ct/admin/main";
import "./shell.css";
import { handleBackButton } from "./backButton";
import { syncSystemBars } from "./systemBars";
import { followTextSize } from "./textZoom";

handleBackButton();
syncSystemBars();
followTextSize();

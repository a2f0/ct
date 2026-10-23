import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<AuthGate />);

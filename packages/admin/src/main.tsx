import { createRoot } from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { policyPage } from "./Policies";
import "./styles.css";

const root = document.getElementById("root");
// The policy pages render without checking for a session.
if (root)
  createRoot(root).render(policyPage(location.pathname) ?? <AuthGate />);

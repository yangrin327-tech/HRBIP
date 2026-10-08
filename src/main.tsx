import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./site-refresh.css";
history.scrollRestoration = "manual";
createRoot(document.getElementById("root")!).render(<App />);

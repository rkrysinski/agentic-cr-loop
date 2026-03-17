import { logFatalError, runServer } from "./runServer.js";

runServer().catch(logFatalError);

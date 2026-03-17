import { logFatalError, runServer } from "./runServer.js";

runServer({ dev: true }).catch(logFatalError);

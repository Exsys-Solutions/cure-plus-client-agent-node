/*
 *
 * `loadEnv`: side-effect-only module that populates process.env from .env -
 * import this first (before anything that reads TOMCAT_FOLDER_PATH/
 * CLIENT_ID/etc.) in every entry point (index.mjs, discover.mjs,
 * installOnce.mjs).
 *
 * This is separate from sites.json on purpose: .env holds this machine's
 * own operational settings (where to look, who it is) that a human sets
 * once; sites.json holds what discovery actually found there.
 *
 */
import dotenv from "dotenv";

dotenv.config();

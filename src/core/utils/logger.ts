export const logger = {
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(`[framework] ${message}`);
    }
  },
};

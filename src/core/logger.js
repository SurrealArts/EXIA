import pino from "pino";

const level = process.env.LOG_LEVEL || "info";

const logger = pino({
  level,
  transport: {
    target: "pino/file",
    options: { destination: 1 },
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

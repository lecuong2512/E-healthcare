import { AbstractLogger, LogLevel, LogMessage, QueryRunner } from 'typeorm';

/**
 * TypeORM's migration CLI enables query logging and normally appends all query
 * parameters. Some migrations legitimately receive secrets (for example the
 * medical-data encryption key), so parameters must never reach stdout/stderr.
 */
export class SafeTypeOrmLogger extends AbstractLogger {
  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | string | number | (LogMessage | string | number)[],
    queryRunner?: QueryRunner,
  ): void {
    const messages = this.prepareLogMessages(
      logMessage,
      { appendParameterAsComment: false, highlightSql: false },
      queryRunner,
    );
    for (const message of messages) {
      const rendered = `${message.prefix ? `${message.prefix}: ` : ''}${message.message}`;
      const type = message.type ?? level;
      if (type === 'error' || type === 'query-error') {
        console.error(rendered);
      } else if (type === 'warn' || type === 'query-slow') {
        console.warn(rendered);
      } else {
        console.log(rendered);
      }
    }
  }
}

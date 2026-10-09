/**
 * Date and time formatting for the UI.
 *
 * Every one of these pins both the locale and the time zone. That is not
 * decoration: the server renders in UTC and the browser renders in whatever
 * the visitor's machine says, so `new Date(x).toLocaleTimeString()` produces
 * "11:11:49 AM" on the server and "4:41:49 PM" in Bengaluru — React sees the
 * two trees disagree and throws a hydration error.
 *
 * Since this is a Bengaluru marketplace, IST is also the *correct* answer:
 * an order placed at 9pm IST should read 9pm for the shop and the customer,
 * whatever laptop clock the page happens to be open on.
 */
const TIME_ZONE = 'Asia/Kolkata';
const LOCALE = 'en-IN';

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZone: TIME_ZONE,
});

const parse = (value: string | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "01 Oct 2026, 9:05 pm" */
export const formatDateTime = (value: string | Date): string => {
  const date = parse(value);
  return date ? dateTimeFormat.format(date) : '—';
};

/** "01 Oct 2026" */
export const formatDate = (value: string | Date): string => {
  const date = parse(value);
  return date ? dateFormat.format(date) : '—';
};

/** "9:05:32 pm" */
export const formatTime = (value: string | Date): string => {
  const date = parse(value);
  return date ? timeFormat.format(date) : '—';
};

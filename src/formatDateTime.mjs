/*
 *
 * Helper: `formatDateTime`.
 *
 */
const pad = (value) => String(value).padStart(2, "0");

// dd-mm-yyyy hh:mm am/pm - used for every timestamp sent to exsys
// (startedAt/finishedAt/lastSeenAt/lastUpdatedAt) instead of
// toISOString()'s default format.
const formatDateTime = (date = new Date()) => {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const period = hours >= 12 ? "pm" : "am";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${day}-${month}-${year} ${pad(hours)}:${minutes} ${period}`;
};

export default formatDateTime;

// The inverse of the above - parses a "dd-mm-yyyy hh:mm am/pm" string back
// into an epoch number, purely so two of these strings can be compared
// chronologically (see pollLoop.mjs's rollback check). Returns 0 (i.e.
// "oldest possible") for anything blank or unparseable, so a missing value
// never accidentally wins a "is this newer than..." comparison.
export const parseDateTime = (value) => {
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{1,2}):(\d{2}) (am|pm)$/i.exec(
    (value || "").trim(),
  );

  if (!match) return 0;

  const [, day, month, year, hourRaw, minute, period] = match;
  let hours = Number(hourRaw) % 12;

  if (period.toLowerCase() === "pm") hours += 12;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hours,
    Number(minute),
  ).getTime();
};

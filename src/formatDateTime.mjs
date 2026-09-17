/*
 *
 * Helper: `formatDateTime`.
 *
 */
const pad = (value) => String(value).padStart(2, "0");

// dd-mm-yyyy hh:mm AM/PM - used for every timestamp sent to exsys
// (startedAt/finishedAt/lastSeenAt/lastUpdatedAt) instead of
// toISOString()'s default format.
const formatDateTime = (date = new Date()) => {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const period = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${day}-${month}-${year} ${pad(hours)}:${minutes} ${period}`;
};

export default formatDateTime;

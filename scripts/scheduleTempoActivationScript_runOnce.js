//Cron Time Format, "* * * * * *" --> 1.*=second 2.*=minute 3.*=hour 4.*=day_Of_month 5.*=month 6.*=day_of_week
//Cron Time Format, * = all, 1-4 --> from 1 to 4, /15 --> every 15, SUN-SAT support for day_of_week, JAN-DEC support for month
//Cron Time Format Examples:
// "*/15 * 1-4 * * *" --> Run every 15 seconds from 1 to 4 hours;
// "0 */2 1-4 * * *" --> Run every two minutes from 1 to 4 hours;
// "0 0 7 * * MON-FRI" --> Run at 7:00 every working day;
// "0 30 23 30 * *" --> Run at 23:30 every 30th day of month.

Shelly.call('Schedule.Create', {enable: true, timespec: "0 15-30 21 * * *", calls:
[
  {method:"Script.Start", params:{id:2}},
]});

Shelly.call('Schedule.Create', {enable: true, timespec: "30 15-30 21 * * *", calls:
[
  {method:"Script.Stop", params:{id:2}},
]});


Shelly.call('Schedule.Create', {enable: true, timespec: "0 0 1 * * *", calls:
[
  {method:"Script.Start", params:{id:1}},
]});
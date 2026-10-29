alter table app.submission_attempts
  add column provider_status_url text,
  add column provider_result_url text;

alter table app.submission_attempts
  add constraint submission_attempts_provider_status_url_check
  check (provider_status_url is null or (length(provider_status_url) <= 2048 and (provider_status_url ~ '^https://queue[.]fal[.]run(/|$)' or provider_status_url ~ '^https://api[.]replicate[.]com(/|$)')));

alter table app.submission_attempts
  add constraint submission_attempts_provider_result_url_check
  check (provider_result_url is null or (length(provider_result_url) <= 2048 and (provider_result_url ~ '^https://queue[.]fal[.]run(/|$)' or provider_result_url ~ '^https://api[.]replicate[.]com(/|$)')));


* [`GET /users/{user_id_or_email}/presence`](/api/get-user-presence): The
  endpoint now returns presence data in the modern format, with
  `active_timestamp` and `idle_timestamp` fields. Previously, the legacy
  format was returned by default, with `website` and `aggregated` keys.

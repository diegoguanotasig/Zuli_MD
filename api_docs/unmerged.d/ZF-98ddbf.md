* [`GET /events`](/api/get-events): Removed the deprecated `user` object
  from `reaction` events, as all core clients have migrated to use the
  `user_id` field, superseding the temporary re-addition in feature level 339
  and completing the transition started in feature level 328.

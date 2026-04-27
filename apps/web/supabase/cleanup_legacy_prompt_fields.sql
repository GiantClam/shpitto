-- Development-only cleanup for the canonical prompt cutover.
-- This intentionally deletes legacy prompt fields instead of migrating them.

update shpitto_chat_messages
set metadata = metadata - 'promptDraft' - 'generationRoutingContract'
where metadata is not null
  and metadata ?| array['promptDraft', 'generationRoutingContract'];

update shpitto_chat_tasks
set result = jsonb_set(
  result,
  '{internal,inputState,workflow_context}',
  (result #> '{internal,inputState,workflow_context}') - 'requirementDraft' - 'generationRoutingContract',
  false
)
where result #> '{internal,inputState,workflow_context}' is not null
  and (result #> '{internal,inputState,workflow_context}') ?| array['requirementDraft', 'generationRoutingContract'];

update shpitto_chat_tasks
set result = jsonb_set(
  result,
  '{internal,sessionState,workflow_context}',
  (result #> '{internal,sessionState,workflow_context}') - 'requirementDraft' - 'generationRoutingContract',
  false
)
where result #> '{internal,sessionState,workflow_context}' is not null
  and (result #> '{internal,sessionState,workflow_context}') ?| array['requirementDraft', 'generationRoutingContract'];

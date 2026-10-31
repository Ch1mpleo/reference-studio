-- Systems remain part of the revisioned board aggregate; no parallel writer.
UPDATE project_boards SET layout_json = json_set(layout_json, '$.systems', json('[]'))
WHERE json_type(layout_json, '$.systems') IS NULL;

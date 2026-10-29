-- The project board remains the atomic owner. Existing direction drafts start at
-- revision 1; every subsequent related write advances its embedded revision.
UPDATE project_boards
SET layout_json = json_set(layout_json, '$.frames', json(COALESCE((
  SELECT json_group_array(json_set(value, '$.revision', 1))
  FROM json_each(project_boards.layout_json, '$.frames')
), '[]')));

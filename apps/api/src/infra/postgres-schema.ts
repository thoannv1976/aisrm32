/**
 * Lược đồ PostgreSQL cho bản Local (phương án A2 — ADR-0003).
 * - Bảng `docs`: mỗi dòng là một tài liệu (đường dẫn kiểu Firestore), dữ liệu ở cột JSONB.
 * - Schema `report`: view quan hệ chỉ-đọc cho báo cáo / BI / kết nối HEMIS. KHÔNG ghi qua view.
 * Migration có phiên bản, chỉ thêm (không sửa migration đã phát hành); chạy tự động khi API khởi động.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'docs',
    sql: `
create table docs (
  path        text primary key,
  parent      text not null,
  id          text not null,
  data        jsonb not null,
  tenant_id   text generated always as (case when split_part(path, '/', 1) = 'tenants' then split_part(path, '/', 2) end) stored,
  coll        text generated always as (regexp_replace(parent, '^.*/', '')) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index docs_parent_id on docs (parent, id collate "C");
create index docs_tenant_coll on docs (tenant_id, coll);
`,
  },
  {
    version: 2,
    name: 'report_views',
    sql: `
create schema if not exists report;

create or replace function report.ts(v text) returns timestamptz language plpgsql immutable as $$
begin
  return v::timestamptz;
exception when others then
  return null;
end $$;

create or replace function report.num(v text) returns numeric language plpgsql immutable as $$
begin
  return v::numeric;
exception when others then
  return null;
end $$;

create view report.v_proposals as
select tenant_id, id,
  data->>'code' as code, data->>'title' as title, data->>'status' as status,
  data->>'callId' as call_id, data->>'callCode' as call_code,
  data->>'unitId' as unit_id, data->>'unitName' as unit_name,
  data->>'ownerUid' as owner_uid, data->>'ownerName' as owner_name,
  report.num(data->>'budgetVnd') as budget_vnd, report.num(data->>'durationMonths') as duration_months,
  data->>'projectId' as project_id,
  report.ts(data->>'submittedAt') as submitted_at, report.ts(data->>'decidedAt') as decided_at,
  report.ts(data->>'createdAt') as created_at, report.ts(data->>'updatedAt') as updated_at,
  report.num(data->>'version') as version
from docs where coll = 'proposals' and parent = 'tenants/' || tenant_id || '/proposals';

create view report.v_projects as
select tenant_id, id,
  data->>'code' as code, data->>'title' as title, data->>'status' as status,
  data->>'proposalId' as proposal_id,
  data->>'unitId' as unit_id, data->>'unitName' as unit_name,
  data->>'ownerUid' as owner_uid, data->>'ownerName' as owner_name,
  report.num(data->>'budgetVnd') as budget_vnd,
  data->>'startDate' as start_date, data->>'endDate' as end_date,
  report.num(data#>>'{milestoneStats,total}') as milestones_total,
  report.num(data#>>'{milestoneStats,accepted}') as milestones_accepted,
  report.ts(data->>'createdAt') as created_at, report.ts(data->>'updatedAt') as updated_at,
  report.num(data->>'version') as version
from docs where coll = 'projects' and parent = 'tenants/' || tenant_id || '/projects';

create view report.v_publications as
select tenant_id, id,
  data->>'code' as code, data->>'title' as title, data->>'type' as type, data->>'status' as status,
  data->>'venue' as venue, report.num(data->>'year') as year, data->>'doi' as doi,
  data->'indexing' as indexing,
  data->>'unitId' as unit_id, data->>'unitName' as unit_name,
  data->>'ownerUid' as owner_uid, data->>'ownerName' as owner_name,
  data->>'projectId' as project_id,
  report.ts(data->>'createdAt') as created_at, report.ts(data->>'updatedAt') as updated_at,
  report.num(data->>'version') as version
from docs where coll = 'publications' and parent = 'tenants/' || tenant_id || '/publications';

create view report.v_audit_events as
select tenant_id, id,
  report.ts(data->>'at') as at, data->>'actorUid' as actor_uid, data->>'action' as action,
  data->>'resourceType' as resource_type, data->>'resourceId' as resource_id, data->>'result' as result
from docs where coll = 'auditEvents' and parent = 'tenants/' || tenant_id || '/auditEvents';
`,
  },
];

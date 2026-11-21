import { Controller, Get, Query } from '@nestjs/common';
import { hasAnyRole, normalizeTitle, type Principal, type Unit } from '@aisrm/shared';
import { CurrentPrincipal } from '../common/auth';
import { forbidden } from '../common/errors';
import { tcol } from '../common/firebase';

@Controller()
export class OrgController {
  @Get('units')
  async units(@CurrentPrincipal() p: Principal) {
    const snap = await tcol(p.tenantId, 'units').get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Unit);
    items.sort((a, b) => a.ancestorIds.length - b.ancestorIds.length || a.name.localeCompare(b.name, 'vi'));
    return { items };
  }

  /** Tìm người trong trường (để thêm thành viên/tác giả). Chỉ trả thông tin cơ bản. */
  @Get('people')
  async people(@CurrentPrincipal() p: Principal, @Query('q') q?: string) {
    const snap = await tcol(p.tenantId, 'people').where('status', '==', 'ACTIVE').limit(1000).get();
    const needle = q ? normalizeTitle(q) : '';
    const units = new Map((await tcol(p.tenantId, 'units').get()).docs.map((d) => [d.id, d.get('name') as string]));
    const items = snap.docs
      .map((d) => ({
        uid: d.id,
        displayName: d.get('displayName') as string,
        title: (d.get('title') as string) ?? null,
        unitId: (d.get('unitId') as string) ?? null,
        unitName: units.get(d.get('unitId')) ?? null,
      }))
      .filter((x) => !needle || normalizeTitle(x.displayName).includes(needle))
      .slice(0, 50);
    return { items };
  }

  /** Danh sách phân quyền — chỉ quản trị hệ thống / trưởng phòng KH. */
  @Get('admin/role-bindings')
  async bindings(@CurrentPrincipal() p: Principal) {
    if (!hasAnyRole(p, ['SYS_ADMIN', 'SCIENCE_HEAD'])) throw forbidden();
    const [b, people, units] = await Promise.all([
      tcol(p.tenantId, 'roleBindings').get(),
      tcol(p.tenantId, 'people').get(),
      tcol(p.tenantId, 'units').get(),
    ]);
    const names = new Map(people.docs.map((d) => [d.id, d.get('displayName') as string]));
    const unitNames = new Map(units.docs.map((d) => [d.id, d.get('name') as string]));
    return {
      items: b.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          uid: x.uid,
          displayName: names.get(x.uid) ?? x.uid,
          role: x.role,
          scopeType: x.scopeType,
          scopeId: x.scopeId ?? null,
          scopeName: x.scopeId ? (unitNames.get(x.scopeId) ?? x.scopeId) : 'Toàn trường',
          validUntil: x.validUntil ?? null,
          delegatedBy: x.delegatedBy ?? null,
        };
      }),
    };
  }
}

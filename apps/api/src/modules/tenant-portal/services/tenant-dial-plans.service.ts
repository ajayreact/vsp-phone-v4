import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkImportDialPlanRulesDto,
  CreateDialPlanRuleDto,
  TestDialPlanDto,
  UpdateDialPlanRuleDto,
} from '../dto/tenant-dial-plans.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantDialPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.dialPlanRule.findMany({
      where: tenantScope(tenantId),
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.dialPlanRule.findFirst({
      where: { id, ...tenantScope(tenantId) },
    });
    if (!row) throw new NotFoundException('Dial plan rule not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateDialPlanRuleDto) {
    const rule = await this.prisma.dialPlanRule.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        ruleType: dto.ruleType,
        pattern: dto.pattern,
        replacement: dto.replacement,
        priority: dto.priority ?? 100,
        enabled: dto.enabled ?? true,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        createdBy: userId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.dial_plan.create',
      entityType: 'DialPlanRule',
      entityId: rule.id,
      metadata: { name: dto.name, ruleType: dto.ruleType },
    });

    return rule;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateDialPlanRuleDto) {
    await this.getById(tenantId, id);

    const rule = await this.prisma.dialPlanRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.ruleType !== undefined ? { ruleType: dto.ruleType } : {}),
        ...(dto.pattern !== undefined ? { pattern: dto.pattern } : {}),
        ...(dto.replacement !== undefined ? { replacement: dto.replacement } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.metadata !== undefined ? { metadata: dto.metadata as Prisma.InputJsonValue } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.dial_plan.update',
      entityType: 'DialPlanRule',
      entityId: rule.id,
    });

    return rule;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.getById(tenantId, id);
    const rule = await this.prisma.dialPlanRule.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.dial_plan.delete',
      entityType: 'DialPlanRule',
      entityId: rule.id,
    });

    return rule;
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportDialPlanRulesDto) {
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const row of dto.rows) {
      const name = String(row.name ?? '');
      if (!name || !row.ruleType || !row.pattern) {
        results.push({ name: name || 'unknown', ok: false, error: 'name, ruleType, pattern required' });
        continue;
      }
      try {
        await this.create(tenantId, userId, {
          name,
          ruleType: row.ruleType as CreateDialPlanRuleDto['ruleType'],
          pattern: String(row.pattern),
          replacement: row.replacement ? String(row.replacement) : undefined,
        });
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : 'Import failed' });
      }
    }
    return { results };
  }

  async exportJson(tenantId: string) {
    return this.list(tenantId);
  }

  async test(tenantId: string, dto: TestDialPlanDto) {
    const rules = (await this.list(tenantId)).filter((r) => r.enabled);
    let number = dto.dialedNumber;
    const steps: Record<string, unknown>[] = [{ step: 'input', number }];

    for (const rule of rules.sort((a, b) => a.priority - b.priority)) {
      let matched = false;
      try {
        const regex = new RegExp(rule.pattern);
        matched = regex.test(number);
        if (matched && rule.replacement != null) {
          const before = number;
          number = number.replace(regex, rule.replacement);
          steps.push({ step: 'rule_applied', ruleId: rule.id, name: rule.name, ruleType: rule.ruleType, before, after: number });
        } else if (matched) {
          steps.push({ step: 'rule_matched', ruleId: rule.id, name: rule.name, ruleType: rule.ruleType });
        }
      } catch {
        if (number.includes(rule.pattern)) {
          matched = true;
          if (rule.replacement != null) {
            const before = number;
            number = number.replace(rule.pattern, rule.replacement);
            steps.push({ step: 'rule_applied', ruleId: rule.id, name: rule.name, before, after: number });
          }
        }
      }
    }

    return { input: dto.dialedNumber, output: number, steps };
  }
}

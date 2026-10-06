import { z } from 'zod';

const countSchema = z
  .object({
    count: z.number(),
    label: z.string().optional(),
  })
  .passthrough();

export const apiSuccessSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
    message: z.string().optional(),
  })
  .passthrough();

export const dtrSummarySchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        totalDtrs: countSchema.optional(),
        dtrsOn: countSchema.optional(),
        dtrsOff: countSchema.optional(),
        activeAlerts: countSchema.optional(),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .passthrough();

const powerPointSchema = z
  .object({
    label: z.string(),
  })
  .passthrough();

export const dtrPointsSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        points: z.array(powerPointSchema),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .passthrough();

export const dtrBreakdownSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        total: z.number().optional(),
        items: z.array(z.object({ label: z.string() }).passthrough()).optional(),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .passthrough();

const lookupItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
  })
  .passthrough();

export const lookupListSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        items: z.array(lookupItemSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const hierarchyListSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        items: z.array(
          lookupItemSchema.extend({
            order: z.number(),
          }),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export const meterCommunicationSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        communicatingCount: z.number().nonnegative(),
        nonCommunicatingCount: z.number().nonnegative(),
        activeMeters: z.number().nonnegative(),
        rows: z.array(
          z
            .object({
              meterSerialNumber: z.string().nullable(),
              communicationStatus: z.enum(['communicating', 'non-communicating']),
            })
            .passthrough(),
        ),
        pagination: z
          .object({
            total: z.number().nonnegative(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const scopeAnchorSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        anchor: z
          .object({
            lookupId: z.number().int().positive(),
            hierarchyLevelId: z.number().int().positive(),
            name: z.string(),
          })
          .passthrough()
          .nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export const sessionMeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        user: z
          .object({
            email: z.string().email(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const permissionKeysSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        permissions: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

export const permissionModulesSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        modules: z.array(
          z
            .object({
              key: z.string().min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export const ledgerValidateSchema = z
  .object({
    success: z.literal(true),
    batchCode: z.string().min(1),
    mode: z.enum(['MERGE', 'OVERRIDE']),
    summary: z
      .object({
        total: z.number().nonnegative(),
        new: z.number().nonnegative(),
        updated: z.number().nonnegative(),
        unchanged: z.number().nonnegative(),
        invalid: z.number().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

export const exportJobSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        jobId: z.string().min(1),
        status: z.string().min(1),
        rowEstimate: z.number().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

export const validationErrorSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.literal('VALIDATION_ERROR'),
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const masterListSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        pagination: z
          .object({
            total: z.number().nonnegative(),
          })
          .passthrough(),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .passthrough();

export const detailsTotalSchema = z
  .object({
    success: z.literal(true),
    data: z.record(z.unknown()),
    message: z.string().optional(),
  })
  .passthrough();

export const healthSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string().min(1),
  })
  .strict();

export const errorSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const loginSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        accessToken: z.string().min(1),
        expiresIn: z.number().int().positive(),
        tokenType: z.literal('Bearer'),
        user: z
          .object({
            email: z.string().email(),
            role: z.string().min(1),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();

export const dtrSchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    circle: z.string().min(1),
    locality: z.string().min(1),
    status: z.enum(['online', 'offline', 'warning']),
    load: z
      .object({
        value: z.number(),
        unit: z.string().min(1),
        recordedAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

export const dtrListSchema = z
  .object({
    items: z.array(dtrSchema).min(1),
  })
  .strict();

export const chartPointSchema = z
  .object({
    x: z.string().min(1),
    y: z.number(),
  })
  .strict();

export const chartSeriesSchema = z
  .object({
    name: z.string().min(1),
    points: z.array(chartPointSchema).min(1),
  })
  .strict();

export const metricsSchema = z
  .object({
    metric: z.enum(['communication', 'energy-loss']),
    title: z.string().min(1),
    unit: z.string().min(1),
    series: z.array(chartSeriesSchema).min(1),
  })
  .strict();

const countSliceSchema = z
  .object({
    count: z.number().nonnegative(),
    percentage: z.string(),
    label: z.string().min(1),
  })
  .passthrough();

const trendSliceSchema = countSliceSchema.extend({
  trends: z.array(z.number()),
});

export const consumerMetricsSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        timestamp: z.string().min(1),
        connectionStatus: z.object({
          totalMeterCount: z.number().nonnegative(),
          cd: countSliceSchema,
          td: countSliceSchema,
          pd: countSliceSchema,
        }),
        categoryWiseConsumer: z.record(countSliceSchema),
        phaseWiseConsumer: z.record(countSliceSchema),
        oemWiseConsumer: z.record(countSliceSchema),
        consumerType: z.object({
          totalConsumers: trendSliceSchema,
          prepaid: trendSliceSchema,
          postpaid: trendSliceSchema,
          netMeter: trendSliceSchema,
        }),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .strict();

export const meterStatusSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        timestamp: z.string().min(1).optional(),
        totalMeterCount: z.number().nonnegative().optional(),
        totalConsumerMeters: z.number().nonnegative().optional(),
        communicatedConsumerMeters: z.number().nonnegative().optional(),
        nonCommunicatedConsumerMeters: z.number().nonnegative().optional(),
        communicatedPercentage: z.union([z.string(), z.number()]).optional(),
        nonCommunicatedPercentage: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough(),
    message: z.string().optional(),
  })
  .passthrough();

export type HealthResponse = z.infer<typeof healthSchema>;
export type ErrorResponse = z.infer<typeof errorSchema>;
export type LoginResponse = z.infer<typeof loginSchema>;
export type Dtr = z.infer<typeof dtrSchema>;
export type DtrList = z.infer<typeof dtrListSchema>;
export type ChartPointModel = z.infer<typeof chartPointSchema>;
export type ChartSeriesModel = z.infer<typeof chartSeriesSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type ConsumerMetrics = z.infer<typeof consumerMetricsSchema>;
export type MeterStatus = z.infer<typeof meterStatusSchema>;

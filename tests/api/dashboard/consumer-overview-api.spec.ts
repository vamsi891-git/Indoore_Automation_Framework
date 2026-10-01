import { expect,functionality,test} from '../../../src/core/fixtures/test.fixtures';
import { ApiClient } from '../../../src/core/api/api.client';
import { consumerMetricsSchema } from '../../../src/core/api/models';
import { expectApiHeaders } from '../expect-api-headers';

test.describe('Consumer overview API @dashboard @regression', ()=>{
    functionality('Dashboard');
    test('returns consumer overview metrics @smoke',async ({api,data,env})=>{
        await api.authenticate(data.user('validAdmin'));
        const result = await api.get('consumerMetrics', {query : {view: 'consumer'},expectedStatus:200});
        expect(result.durationMs, `response took ${result.durationMs}ms`).toBeLessThanOrEqual(env.timeouts.api);
        expectApiHeaders(result, { authorized: true });
        const body = consumerMetricsSchema.parse(result.body);
        const dataNode = body.data;
        const connected = dataNode.connectionStatus.cd.count + dataNode.connectionStatus.td.count + dataNode.connectionStatus.pd.count;
        expect(connected, `connection slices ${connected} != totalMeterCount ${dataNode.connectionStatus.totalMeterCount}`).toBe(dataNode.connectionStatus.totalMeterCount);
        const types = dataNode.consumerType;
        expect(types.prepaid.count + types.postpaid.count,'prepaid+postpaid must equal total consumers').toBe(types.totalConsumers.count);
        const oem = sumCounts(dataNode.oemWiseConsumer);
        const phase = sumCounts(dataNode.phaseWiseConsumer);
        const category = sumCounts(dataNode.categoryWiseConsumer);
        expect(oem,`OEM sum ${oem} != phase sum${phase}`).toBe(phase);
        expect(category,`category sum ${category} != total consumers ${types.totalConsumers.count}`).toBe(types.totalConsumers.count);
    });

    test('rejects consumer metrics without a token', async ({ request, app, env }) => {
        const anonymous = new ApiClient(request, app, env);
        const result = await anonymous.get('consumerMetrics', {
            query: { view: 'consumer' },
            expectedStatus: 401,
        });
        expect(result.status).toBe(401);
        expectApiHeaders(result);
    });

});
function sumCounts(record: Record<string, { count: number }>): number {
    return Object.values(record).reduce((sum, item) => sum + item.count, 0);
  }
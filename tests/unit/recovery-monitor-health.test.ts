import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observeRecoveryMonitorHealth, recoveryMonitorReady} from '../../src/modules/operations/recovery-monitor-health.ts';
test('delivery retries and backoff never mask degradation with fresh observations', () => {
  const now=new Date('2026-10-15T14:00:00Z');
  let state={lastSuccessAt:null as Date|null,errors:0,deliveryPending:false};
  assert.equal(recoveryMonitorReady(state,now),false);
  state=observeRecoveryMonitorHealth(state,'healthy',now);assert.equal(recoveryMonitorReady(state,now),true);
  state=observeRecoveryMonitorHealth(state,'retry',now);assert.equal(state.errors,1);assert.equal(recoveryMonitorReady(state,now),false);
  state=observeRecoveryMonitorHealth(state,'waiting',new Date(now.getTime()+10000));assert.equal(recoveryMonitorReady(state,now),false);
  state=observeRecoveryMonitorHealth(state,'delivered',now);assert.equal(recoveryMonitorReady(state,now),true);
  assert.equal(recoveryMonitorReady(state,new Date(now.getTime()+120000)),false);
  assert.equal(recoveryMonitorReady(state,new Date(now.getTime()-1)),false);
  assert.equal(recoveryMonitorReady(observeRecoveryMonitorHealth({lastSuccessAt:null,errors:0,deliveryPending:false},'waiting',now),now),false);
});

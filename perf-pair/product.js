import http from 'k6/http';
import {check, sleep} from 'k6';
export const options = { vus: 5, duration: '60s',
  summaryTrendStats: ['med', 'p(95)', 'p(99)'],
  thresholds: {checks: ['rate==1'],http_req_failed:['rate==0']} };
export default function () {
  // Four out of five reads select one of 20 hot products.
  const step = __ITER + (__VU - 1) * 37;
  const n = step % 5 === 0 ? 1 + (step * 113) % 10000 : 1 + step % 20;
  const id = 'beef0003-0000-4000-8000-' + String(n).padStart(12,'0');
  const version = __ENV.API_VERSION || 'v1';
  const r = http.get('http://host.docker.internal:3000/api/'+version+'/products/'+id,{tags:{name:'product-detail'}});
  check(r,{'product HTTP 200': res=>res.status===200});
  sleep(0.2);
}

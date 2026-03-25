export const scenarios = [
  {
    id: 'health',
    title: 'Health endpoint',
    path: '/health',
    method: 'GET',
    connections: 20,
    duration: 10,
    headers: {
      Accept: 'application/json',
    },
  },
  {
    id: 'escrow-list',
    title: 'Escrow listing',
    path: '/api/escrows?page=1&limit=20&status=Active,Completed&sortBy=createdAt&sortOrder=desc',
    method: 'GET',
    connections: 35,
    duration: 12,
    headers: {
      Accept: 'application/json',
    },
  },
  {
    id: 'escrow-details',
    title: 'Escrow details',
    requests: [
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}',
      },
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}/milestones?page=1&limit=10',
      },
    ],
    connections: 25,
    duration: 12,
    headers: {
      Accept: 'application/json',
    },
  },
  {
    id: 'user-profile',
    title: 'User profile and history',
    requests: [
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/escrows?role=all&page=1&limit=5',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/stats',
      },
    ],
    connections: 20,
    duration: 12,
    headers: {
      Accept: 'application/json',
    },
  },
];

export function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id);
}

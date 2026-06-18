import { PageHeader, Button } from '@bmag-itam/client';

export const WithActions = () => (
  <div style={{ width: 640, maxWidth: '100%' }}>
    <PageHeader
      title="Assets"
      description="1,284 tracked devices across 6 locations"
      actions={
        <>
          <Button variant="outline" size="sm">Export</Button>
          <Button size="sm">Add asset</Button>
        </>
      }
    />
  </div>
);

export const TitleOnly = () => (
  <div style={{ width: 640, maxWidth: '100%' }}>
    <PageHeader title="Maintenance schedule" description="Upcoming and overdue service across all locations" />
  </div>
);

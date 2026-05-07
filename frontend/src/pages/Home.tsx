import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ar } from '@/i18n/ar';

const modules = [
  ar.topbar.inventory,
  ar.topbar.sales,
  ar.topbar.customers,
  ar.topbar.payments,
  ar.topbar.invoices,
  ar.topbar.reports,
  ar.topbar.settings,
];

export function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{ar.home.welcome}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {modules.map((m) => (
          <Card key={m}>
            <CardHeader>
              <CardTitle className="text-base">{m}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

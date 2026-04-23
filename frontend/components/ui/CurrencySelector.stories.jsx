import { CurrencyProvider } from '../../contexts/CurrencyContext';
import CurrencySelector from './CurrencySelector';

export default {
  title: 'UI/CurrencySelector',
  component: CurrencySelector,
  decorators: [(Story) => <CurrencyProvider><Story /></CurrencyProvider>],
  tags: ['autodocs'],
};

export const Default = {};

export const Small = { args: { size: 'sm' } };

export const InHeader = {
  render: () => (
    <CurrencyProvider>
      <div className="flex items-center gap-3 bg-gray-950 p-4 rounded-lg">
        <span className="text-white text-sm">Header area</span>
        <CurrencySelector size="sm" />
      </div>
    </CurrencyProvider>
  ),
};

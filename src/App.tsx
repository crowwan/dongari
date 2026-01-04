import { useState } from 'react';
import type { TabType } from './types/accounting';
import { useAccountingData } from './hooks/useAccountingData';
import { TabNavigation } from './components/common/TabNavigation';
import { BasicInfoTab } from './components/tabs/BasicInfoTab';
import { MonthlyInputTab } from './components/tabs/MonthlyInputTab';
import { IncomeDetailTab } from './components/tabs/IncomeDetailTab';
import { PreviewTab } from './components/tabs/PreviewTab';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const {
    data,
    updateBasicInfo,
    updateMonthlyData,
    addExpenseItem,
    updateExpenseItem,
    removeExpenseItem,
    addIncomeItem,
    updateIncomeItem,
    removeIncomeItem,
  } = useAccountingData();

  const renderTab = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <BasicInfoTab
            basicInfo={data.basicInfo}
            onUpdate={updateBasicInfo}
          />
        );
      case 'monthly':
        return (
          <MonthlyInputTab
            monthlyData={data.monthlyData}
            onUpdateMonth={updateMonthlyData}
            onAddExpenseItem={addExpenseItem}
            onUpdateExpenseItem={updateExpenseItem}
            onRemoveExpenseItem={removeExpenseItem}
          />
        );
      case 'income':
        return (
          <IncomeDetailTab
            incomeItems={data.incomeItems}
            monthlyData={data.monthlyData}
            onAdd={addIncomeItem}
            onUpdate={updateIncomeItem}
            onRemove={removeIncomeItem}
          />
        );
      case 'preview':
        return <PreviewTab data={data} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-md mx-auto bg-white min-h-screen flex flex-col">
        <header className="bg-blue-600 text-white p-4 text-center">
          <h1 className="text-xl font-bold">
            {data.basicInfo.year}년 {data.basicInfo.clubName || '동아리'} 회계
          </h1>
        </header>

        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="flex-1 overflow-auto">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}

export default App;

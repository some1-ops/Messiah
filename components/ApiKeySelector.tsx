
import React from 'react';

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        onKeySelected();
      } else {
        alert("API Key selection is not available in this environment.");
      }
    } catch (e) {
      console.error("Error opening API key selector", e);
      alert("Could not select API key.");
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg text-center my-4 border border-blue-500">
      <h3 className="font-bold text-lg mb-2">Video Generation Requires API Key</h3>
      <p className="text-sm text-gray-400 mb-4">
        To use Veo video generation, you must select an API key. This will be used for billing purposes.
        For more information, see the{' '}
        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          billing documentation
        </a>.
      </p>
      <button
        onClick={handleSelectKey}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
      >
        Select API Key
      </button>
    </div>
  );
};

export default ApiKeySelector;

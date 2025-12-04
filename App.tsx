import React, { useState, useEffect } from 'react';
import ChatWidget from './Components/ChatWidget';
import SetupPanel from './Components/SetupPanel';
import { BusinessConfig } from './types';

// Default configuration for QR Code Stickers business
const DEFAULT_CONFIG: BusinessConfig = {
  businessName: "QR Code Stickers",
  tradeType: "Custom Printing & Labels",
  contactName: "Simon",
  services: "Custom QR code stickers, waterproof asset tags, vehicle decals, NFC smart stickers. We also have Off-the-shelf QR Code stickers available on the Shop (link in the navigation menu) for next day delivery.",
  pricing: "Custom orders: Quotes are strictly on-demand as they depend on size, material, and other factors. Please contact us via the form, email, or call 07544683677 for a quote. Off-the-shelf: Check Shop for prices.",
  availability: "Mon-Fri 9am-5pm GMT. Phone: 07544683677. Online ordering 24/7.",
  sitemapUrl: "https://qrcodestickers.co.uk",
  knowledgeBaseText: `
  FAQ: What size are the off the shelf stickers you provide?
  Answer: Our standard off the shelf stickers are sized at 30x40mm (portrait, not landscape) and include a unique number on each. These sequentially numbered QR code stickers feature the QR code and the number in plain text. They are conveniently sized to fit on fire doors and small items that require auditing or tracking. Printed on white self-adhesive vinyl, they are laminated and kiss cut with radius corners making them robust enough for use in outdoor environments.
  `
};

const App: React.FC = () => {
  const [config, setConfig] = useState<BusinessConfig>(() => {
    const saved = localStorage.getItem('tradeTalkConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration check: 
      // Ensure we are using 'Simon', the correct shop details, the NEW phone number/pricing logic,
      // AND the new knowledge base info about sticker sizes.
      if (
        parsed.contactName !== 'Simon' || 
        !parsed.services.toLowerCase().includes('off-the-shelf') ||
        !parsed.pricing.includes('07544683677') || 
        !parsed.sitemapUrl ||
        !parsed.knowledgeBaseText?.includes('30x40mm') // Force update if knowledge base is missing the new sticker info
      ) {
        return { ...parsed, ...DEFAULT_CONFIG };
      }
      return parsed;
    }
    return DEFAULT_CONFIG;
  });

  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    localStorage.setItem('tradeTalkConfig', JSON.stringify(config));
  }, [config]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-transparent relative">
      {/* 
        This wrapper mimics a hero section or a specific div on a website.
        The ChatWidget now takes up the space it is given.
      */}
      <div className="w-full flex justify-center">
        <ChatWidget 
          config={config} 
        />
      </div>
        
      {showSetup && (
        <SetupPanel 
          config={config} 
          onSave={setConfig} 
          onClose={() => setShowSetup(false)} 
        />
      )}
    </div>
  );
};

export default App;
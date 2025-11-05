import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

const ReferralSystem = () => {
  const { userId } = useContext(AuthContext);
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    successfulReferrals: 0,
    pendingReferrals: 0,
    earnedRewards: 0,
  });

  useEffect(() => {
    // Fetch user's referral code and stats
    // This would be an API call in a real application
    const fetchReferralData = () => {
      // Simulating API call
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            referralCode: 'USER123',
            stats: {
              totalReferrals: 10,
              successfulReferrals: 5,
              pendingReferrals: 3,
              earnedRewards: 50,
            },
          });
        }, 1000);
      });
    };

    fetchReferralData().then(data => {
      setReferralCode(data.referralCode);
      setReferralStats(data.stats);
    });
  }, [userId]);

  const generateNewReferralCode = () => {
    // This would be an API call in a real application
    // Simulating API call
    setTimeout(() => {
      const newCode = 'USER' + Math.floor(1000 + Math.random() * 9000);
      setReferralCode(newCode);
      alert(`New referral code generated: ${newCode}`);
    }, 1000);
  };

  const copyReferralLink = () => {
    const referralLink = `https://yourcoachingplatform.com/signup?ref=${referralCode}`;
    navigator.clipboard.writeText(referralLink)
      .then(() => alert('Referral link copied to clipboard!'))
      .catch(err => console.error('Failed to copy text: ', err));
  };

  return (
    <div className="referral-system">
      <h2>Referral Program</h2>
      <div className="referral-code-section">
        <h3>Your Referral Code</h3>
        <p>{referralCode}</p>
        <button onClick={generateNewReferralCode}>Generate New Code</button>
        <button onClick={copyReferralLink}>Copy Referral Link</button>
      </div>
      <div className="referral-stats">
        <h3>Your Referral Stats</h3>
        <ul>
          <li>Total Referrals: {referralStats.totalReferrals}</li>
          <li>Successful Referrals: {referralStats.successfulReferrals}</li>
          <li>Pending Referrals: {referralStats.pendingReferrals}</li>
          <li>Rewards Earned: ${referralStats.earnedRewards}</li>
        </ul>
      </div>
      <div className="referral-info">
        <h3>How It Works</h3>
        <p>Share your referral code with friends. When they sign up using your code:</p>
        <ul>
          <li>They get 10% off their first coaching session</li>
          <li>You earn $10 in platform credits once they complete their first session</li>
        </ul>
        <p>The more friends you refer, the more rewards you earn!</p>
      </div>
    </div>
  );
};

export default ReferralSystem;
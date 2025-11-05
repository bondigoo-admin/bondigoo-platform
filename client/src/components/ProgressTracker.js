import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ProgressTracker = () => {
  const { userId } = useParams();
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState({ title: '', target: '', deadline: '' });
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    // Fetch goals and progress data
    // This would be an API call in a real application
    const fetchData = async () => {
      // Simulating API call
      const goalsData = [
        { id: 1, title: 'Increase Productivity', target: '50%', deadline: '2023-12-31' },
        { id: 2, title: 'Improve Communication Skills', target: '8/10', deadline: '2023-09-30' },
      ];
      const progressData = [
        { date: '2023-01-01', productivity: 20, communication: 5 },
        { date: '2023-02-01', productivity: 25, communication: 6 },
        { date: '2023-03-01', productivity: 30, communication: 6 },
        { date: '2023-04-01', productivity: 35, communication: 7 },
      ];
      setGoals(goalsData);
      setProgress(progressData);
    };
    fetchData();
  }, [userId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewGoal({ ...newGoal, [name]: value });
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    const newGoalWithId = { ...newGoal, id: Date.now() };
    setGoals([...goals, newGoalWithId]);
    setNewGoal({ title: '', target: '', deadline: '' });
  };

  const handleUpdateProgress = (goalId, value) => {
    // This would be an API call in a real application
    console.log(`Updating progress for goal ${goalId}: ${value}`);
    // Update the progress state
    const today = new Date().toISOString().split('T')[0];
    const updatedProgress = [...progress];
    const todayProgress = updatedProgress.find(p => p.date === today);
    if (todayProgress) {
      todayProgress[goals.find(g => g.id === goalId).title.toLowerCase()] = parseInt(value);
    } else {
      updatedProgress.push({ date: today, [goals.find(g => g.id === goalId).title.toLowerCase()]: parseInt(value) });
    }
    setProgress(updatedProgress);
  };

  return (
    <div className="progress-tracker">
      <h2>Progress Tracker</h2>
      
      <div className="goals-section">
        <h3>Your Goals</h3>
        <ul className="goals-list">
          {goals.map(goal => (
            <li key={goal.id} className="goal-item">
              <h4>{goal.title}</h4>
              <p>Target: {goal.target}</p>
              <p>Deadline: {goal.deadline}</p>
              <input 
                type="range" 
                min="0" 
                max="100" 
                onChange={(e) => handleUpdateProgress(goal.id, e.target.value)}
              />
            </li>
          ))}
        </ul>
        
        <form onSubmit={handleAddGoal} className="add-goal-form">
          <h3>Add New Goal</h3>
          <input
            type="text"
            name="title"
            value={newGoal.title}
            onChange={handleInputChange}
            placeholder="Goal Title"
            required
          />
          <input
            type="text"
            name="target"
            value={newGoal.target}
            onChange={handleInputChange}
            placeholder="Target (e.g., 50% or 8/10)"
            required
          />
          <input
            type="date"
            name="deadline"
            value={newGoal.deadline}
            onChange={handleInputChange}
            required
          />
          <button type="submit">Add Goal</button>
        </form>
      </div>
      
      <div className="progress-chart">
        <h3>Your Progress</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={progress}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" scale="point" padding={{ left: 10, right: 10 }} />
<YAxis width={60} />
            <Tooltip />
            <Legend />
            {goals.map(goal => (
              <Line 
                key={goal.id}
                type="monotone"
                dataKey={goal.title.toLowerCase()}
                stroke={`#${Math.floor(Math.random()*16777215).toString(16)}`}
                activeDot={{ r: 8 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProgressTracker;
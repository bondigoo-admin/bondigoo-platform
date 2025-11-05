export const addToWaitingList = (sessionId, clientName, waitingList) => {
  return {
    ...waitingList,
    [sessionId]: [...(waitingList[sessionId] || []), clientName]
  };
};

export const removeFromWaitingList = (sessionId, clientName, waitingList) => {
  return {
    ...waitingList,
    [sessionId]: waitingList[sessionId].filter(name => name !== clientName)
  };
};
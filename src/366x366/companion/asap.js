import { peerSocket } from "messaging";

//====================================================================================================
// Initialize Queue
//====================================================================================================

let queue = [];

//====================================================================================================
// Helpers
//====================================================================================================

function CreateUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
}

//====================================================================================================
// Enqueue
//====================================================================================================

function enqueue(messageKey, message, timeout = 86400000) {
  const uuid = CreateUUID();
  const id = `${messageKey}_${uuid}`;
  const timeoutDate = Date.now() + timeout;

  const data = { id: id, timeout: timeoutDate, messageKey: messageKey, message: message };

  dequeue(null, messageKey);

  queue.push(data);

  if (queue.length === 1) {
    process();
  }
  console.log(`Enqueued message ${id} - ${messageKey} - ${JSON.stringify(message)} - QueueSize: ${queue.length}`);
}

//====================================================================================================
// Dequeue
//====================================================================================================

function dequeue(id, messageKey) {
  if (id) {
    var dequeueResult = false;
    for (let i in queue) {
      if (queue[i].id === id) {
        queue.splice(i, 1);
        dequeueResult = true;
        break;
      }
    }
    if (dequeueResult) {
      console.log(`Dequeued message ${id} - QueueSize: ${queue.length}`);
    } else {
      console.log(`Unable to dequeue message ${id} - QueueSize: ${queue.length}`);
    }
  } else if (messageKey) {
    for (let i in queue) {
      var messageId = queue[i].id;
      var key = messageId.split("_")[0];
      if (key === messageKey) {
        queue.splice(i, 1);
        console.log(`Dequeued message ${messageId} from key ${messageKey} - QueueSize: ${queue.length}`);
      }
    }
  } else {
    console.log("No ID or MessageKey to dequeue");
  }
}

//====================================================================================================
// Process Queue
//====================================================================================================

let retryTimeout = null;

function process() {
  if (retryTimeout != null) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  if (peerSocket.readyState != peerSocket.OPEN) {
    console.log("Socket is closed");
    retryTimeout = setTimeout(process, 2500);
    return;
  }

  if (queue.length > 0) {
    const queueItem = queue[0];
    if (queueItem.timeout < Date.now()) {
      console.log(`Message timeout: ${queueItem.id}`);
      dequeue(queueItem.id, null);
      process();
    } else {
      try {
        console.log(`Sending message ${queueItem.id} - ${queueItem.messageKey} - ${JSON.stringify(queueItem.message)}`);
        peerSocket.send({ asapType: "asap_message", asapMessage: queueItem });
      } catch (e) {
        console.error(e, e.stack);
        retryTimeout = setTimeout(process, 2500);
      }
    }
  }
}

//====================================================================================================
// Socket handling
//====================================================================================================

peerSocket.addEventListener("open", () => {
  console.log("Peer socket opened");
  process();
});

peerSocket.addEventListener("closed", () => {
  console.log("Peer socket closed");
});

peerSocket.addEventListener("error", () => {
  console.error("Peer socket error");
});

peerSocket.addEventListener("message", (event) => {
  const type = event.data.asapType;

  if (type == "asap_message") {
    const id = event.data.asapMessage.id;
    const messageKey = event.data.asapMessage.messageKey;
    const message = event.data.asapMessage.message;

    console.log(`Recieved message ${id} - ${messageKey} - ${JSON.stringify(message)}`);
    try {
      asap.onmessage(messageKey, message);
    } catch (e) {
      console.error(e, e.stack);
    }

    try {
      console.log(`Sending receipt for ${id}`);
      peerSocket.send({ asapType: "asap_receipt", id: id });
    } catch (e) {
      console.error(e, e.stack);
    }
  } else if (type == "asap_receipt") {
    const id = event.data.id;
    console.log(`Got receipt for ${id}`);
    dequeue(id, null);
    process();
  }
});

//====================================================================================================
// Exports
//====================================================================================================

const asap = {
  send: enqueue,
  onmessage: (messageKey, message) => {
    console.log(`Unprocessed asap key: ${messageKey} - ${JSON.stringify(message)}`);
  },
};

export { asap };

import { useState } from "react";
import { Address, AddressInput, Balance, EtherInput } from "../components/scaffold-eth";
import { base64URLStringToBuffer, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from "@simplewebauthn/server";
import { ethers } from "ethers";
import type { NextPage } from "next";
import QRCode from "react-qr-code";
import { useLocalStorage } from "usehooks-ts";
import { useAccount } from "wagmi";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo, useScaffoldContractRead, useScaffoldContractWrite } from "~~/hooks/scaffold-eth";
import { getPublicKeyCoordinates, getSignature } from "~~/utils/scaffold-eth/webautn";

const Home: NextPage = () => {
  const [authRegistrationResponse, setAuthRegistrationResponse] = useLocalStorage<any>("authRegistrationResponse", {});
  const [pubKeyCoordinates, setPubKeyCoordinates] = useLocalStorage<any>("pubKeyCoordinates", undefined);

  const [recipientAddress, setRecipientAddress] = useState<any>("");
  const [amount, setAmount] = useState<any>(0);

  const [walletAmount, setWalletAmount] = useState<any>(0);

  const { address } = useAccount();
  // const signer = useEthersSigner();

  // const { data: deployedWalletFactoryInfo } = useDeployedContractInfo("WalletFactory");
  // const { data: deployedWalletInfo } = useDeployedContractInfo("Wallet");

  const { data: deployData, writeAsync: writeAsyncDeploy } = useScaffoldContractWrite({
    contractName: "WalletFactory",
    functionName: "deploy",
    args: [address ? address : "", pubKeyCoordinates ? pubKeyCoordinates : ""],
  });

  const { data: currentWallet } = useScaffoldContractRead({
    contractName: "WalletFactory",
    functionName: "userWallets",
    args: [address],
  });

  const { data: walletSendData, writeAsync: writeAsyncSend } = useScaffoldContractWrite({
    contractName: "Wallet",
    functionName: "send",
    args: [] as any,
  });

  const onRegister = async () => {
    try {
      const opts: GenerateRegistrationOptionsOpts = {
        rpName: "Wallet Webauth",
        rpID: window.location.hostname,
        userID: `${address}`,
        userName: `${address}`,
        timeout: 60000,
        supportedAlgorithmIDs: [-7, -257],
        authenticatorSelection: {
          residentKey: "required",
        },
        // attestationType: "direct",
      };
      const options = await generateRegistrationOptions(opts);

      const result = await startRegistration(options);
      setAuthRegistrationResponse(result);
    } catch (error) {}
  };

  const onAuth = async () => {
    try {
      const opts: GenerateAuthenticationOptionsOpts = {
        timeout: 60000,
        userVerification: "required",
        rpID: window.location.hostname,
        allowCredentials: [
          {
            id: base64URLStringToBuffer(authRegistrationResponse.id),
            type: "public-key",
            transports: ["hybrid", "internal", "usb", "ble", "cable"],
          },
        ],
      };

      const options = await generateAuthenticationOptions(opts);

      const result = await startAuthentication(options);
    } catch (error) {}
  };

  const onCreateWallet = async () => {
    try {
      const opts: GenerateRegistrationOptionsOpts = {
        rpName: "Wallet Webauth",
        rpID: window.location.hostname,
        userID: `${address}`,
        userName: `${address}`,
        timeout: 60000,
        supportedAlgorithmIDs: [-7, -257],
        authenticatorSelection: {
          residentKey: "required",
        },
        // attestationType: "direct",
      };
      const options = await generateRegistrationOptions(opts);

      const result = await startRegistration(options);
      console.log(`n-🔴 => onCreateWal => result:`, result);

      const pubKeyCoordinates = await getPublicKeyCoordinates(result.response.publicKey);
      // const pubKeyCoordinates = await getPublicKeyCoordinates(mock_result.pubKey);

      setPubKeyCoordinates(pubKeyCoordinates);

      setAuthRegistrationResponse(result);

      writeAsyncDeploy({
        args: [address, pubKeyCoordinates as any],
        value: ethers.utils.parseEther("" + parseFloat(walletAmount ? walletAmount : "0").toFixed(12)) as any,
      });
    } catch (error) {}
  };

  const onSend = async () => {
    const opts: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      userVerification: "required",
      rpID: window.location.hostname,

      allowCredentials: [
        {
          id: base64URLStringToBuffer(authRegistrationResponse.id),
          type: "public-key",
          transports: ["hybrid", "internal", "usb", "ble", "cable"],
        },
      ],
    };

    const options = await generateAuthenticationOptions(opts);

    const result = await startAuthentication(options);

    const signature = await getSignature(
      result.response.signature,
      result.response.authenticatorData,
      result.response.clientDataJSON,
      options.challenge,
    );

    try {
      const formattedSignature = ethers.utils.hexlify(signature);

      writeAsyncSend({
        args: [
          recipientAddress,
          ethers.utils.parseEther("" + parseFloat(amount ? amount : "0").toFixed(12)) as any,
          formattedSignature as any,
        ],
        address: currentWallet,
      } as any);

      setAmount(0);
      setRecipientAddress("");
    } catch (error) {}
  };

  return (
    <>
      <MetaHeader />
      <div className="flex items-center flex-col flex-grow pt-10">
        {currentWallet === ethers.constants.AddressZero && (
          <div className="flex flex-col items-center">
            <EtherInput
              value={walletAmount}
              onChange={value => {
                setWalletAmount(value);
              }}
              placeholder="Initial wallet amount (optional)"
            />

            <button className="btn btn-primary mt-2" onClick={onCreateWallet}>
              Create wallet
            </button>
          </div>
        )}

        {currentWallet !== ethers.constants.AddressZero && (
          <div>
            <div className="flex flex-col items-center">
              <div>Your wallet</div>
              <Balance address={String(currentWallet)} />
              <QRCode value={String(currentWallet)} style={{ height: "90%", margin: 5 }} />
              <Address address={currentWallet} />
            </div>
            <div className="m-2 flex flex-col items-center">
              <div className="m-2 w-full">
                <AddressInput
                  value={recipientAddress}
                  onChange={address => {
                    setRecipientAddress(address);
                  }}
                  placeholder="Recipient address"
                />
              </div>

              <div className="m-2 w-full">
                <EtherInput
                  value={amount}
                  onChange={value => {
                    setAmount(value);
                  }}
                  placeholder="Enter amount"
                />
              </div>

              <div className="m-2">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onSend();
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
